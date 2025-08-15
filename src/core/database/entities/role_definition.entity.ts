import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Route_permission_definition } from './route_permission_definition.entity';

@Entity('role_definition')
export class Role_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: false, unique: true })
    name: string;
    @OneToMany('Route_permission_definition', (rel: any) => rel.role, { cascade: true })
    routePermissions: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
