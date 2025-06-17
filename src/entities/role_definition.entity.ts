import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User_definition } from './user_definition.entity';
import { Route_permission_definition } from './route_permission_definition.entity';

@Entity('role_definition')
export class Role_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: false, unique: true })
    name: string;
    @OneToMany('User_definition', (rel:any) => rel.role, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    users: User_definition[];
    @OneToMany('Route_permission_definition', (rel:any) => rel.role, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    routePermissions: Route_permission_definition[];
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
