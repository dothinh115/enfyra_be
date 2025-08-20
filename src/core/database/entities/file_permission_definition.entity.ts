import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { File_definition } from './file_definition.entity';
import { Role_definition } from './role_definition.entity';
import { User_definition } from './user_definition.entity';

@Entity('file_permission_definition')
@Unique(['file', 'isPublished', 'role', 'user'])
export class File_permission_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "simple-json", nullable: true })
    actions: any[];
    @Column({ type: "simple-json", nullable: true })
    allowedDomains: any;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isPublished: boolean;
    @Index()
    @ManyToOne('File_definition', (rel: any) => rel.permissions, { nullable: false, onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
    @JoinColumn()
    file: any;
    @Index()
    @ManyToOne('Role_definition', { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    role: any;
    @Index()
    @ManyToOne('User_definition', { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    user: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
