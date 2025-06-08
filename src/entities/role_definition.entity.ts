import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User_definition } from "./user_definition.entity";
import { Route_definition } from "./route_definition.entity";

@Entity('role_definition')
export class Role_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: false })
    name: string;
    @ManyToMany(() => User_definition, (rel) => rel.roles, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    users: User_definition[];
    @ManyToMany(() => Route_definition, (rel) => rel.roles, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    routes: Route_definition[];
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
